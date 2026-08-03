package javaapplication1;

/**
 *
 * @author ASUS
 */
import java.util.Scanner;

public class DataSiswa {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        System.out.print("Masukan Nama Kamu :");
        String nama = input.nextLine();     
        System.out.println("Masukan Umur Kamu :");
        int umur = input.nextInt();
        input.nextLine();
        System.out.println("Masukan Kelas : ");
        String kelas = input.nextLine();
        System.out.println("Nama : " +nama);
        System.out.println("Umur : " +umur);
        System.out.println("Kelas : " +kelas);
    }
        
                
    
    }

    
